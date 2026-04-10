/**
 * HoloScript Edge Deployment Pipeline - Nginx Deployer
 *
 * Deploys HoloScript applications to self-hosted/custom infrastructure.
 * Uses SSH/SCP for file transfer, generates Nginx config for serving
 * HoloScript apps, and performs zero-downtime deployments via symlink swap.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

import {
  BaseDeployer,
  DeployConfig,
  DeployResult,
  DeploymentInfo,
  BuildOutput,
} from './BaseDeployer';

const execAsync = promisify(exec);

// ============================================================================
// Nginx-Specific Configuration
// ============================================================================

export interface NginxConfig {
  host: string;
  port?: number;
  username: string;
  keyPath?: string;
  password?: string;
  remotePath?: string;
  nginxConfigPath?: string;
  nginxSitesPath?: string;
}

export interface NginxSiteConfig {
  serverName: string;
  listenPort: number;
  ssl: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  gzip: boolean;
  cacheExpiry: string;
  proxyPass?: string;
  additionalLocations?: NginxLocationBlock[];
}

export interface NginxLocationBlock {
  path: string;
  directives: string[];
}

// ============================================================================
// Nginx Deployer
// ============================================================================

export class NginxDeployer extends BaseDeployer {
  private host: string;
  private port: number;
  private username: string;
  private keyPath?: string;
  private password?: string;
  private remotePath: string;
  private nginxConfigPath: string;
  private nginxSitesPath: string;

  // Deployment history (in-memory)
  private deploymentHistory: DeploymentInfo[] = [];

  // Site config for Nginx
  private siteConfig: NginxSiteConfig;

  // SSH command executor (overridable for testing)
  private sshExecutor: (command: string) => Promise<string>;

  // SCP file uploader (overridable for testing)
  private scpUploader: (localDir: string, remoteDir: string) => Promise<void>;

  constructor(config: NginxConfig) {
    super('nginx');
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username;
    this.keyPath = config.keyPath;
    this.password = config.password;
    this.remotePath = config.remotePath || '/var/www/holoscript';
    this.nginxConfigPath = config.nginxConfigPath || '/etc/nginx/nginx.conf';
    this.nginxSitesPath = config.nginxSitesPath || '/etc/nginx/sites-enabled';

    this.siteConfig = {
      serverName: 'localhost',
      listenPort: 80,
      ssl: false,
      gzip: true,
      cacheExpiry: '7d',
    };

    this.sshExecutor = (command: string) => this.executeSSH(command);
    this.scpUploader = (localDir: string, remoteDir: string) =>
      this.executeScpUpload(localDir, remoteDir);
  }

  /**
   * Override the SSH executor (useful for testing).
   */
  setSshExecutor(executor: (command: string) => Promise<string>): void {
    this.sshExecutor = executor;
  }

  /**
   * Override the SCP uploader (useful for testing).
   */
  setScpUploader(uploader: (localDir: string, remoteDir: string) => Promise<void>): void {
    this.scpUploader = uploader;
  }

  /**
   * Set Nginx site configuration.
   */
  setSiteConfig(config: Partial<NginxSiteConfig>): void {
    this.siteConfig = { ...this.siteConfig, ...config };
  }

  /**
   * Get the current site configuration.
   */
  getSiteConfig(): NginxSiteConfig {
    return { ...this.siteConfig };
  }

  /**
   * Deploy a HoloScript project to a custom server with Nginx.
   * Uses zero-downtime symlink swap strategy.
   */
  async deploy(config: DeployConfig, buildOutput: BuildOutput): Promise<DeployResult> {
    this.validateConfig(config);

    const startTime = Date.now();
    const deploymentId = this.generateDeploymentId();
    const timestamp = Date.now();

    this.emit('deploy:start', config);

    try {
      // Step 1: Prepare remote directories
      const releaseDir = `${this.remotePath}/releases/${timestamp}`;
      const currentLink = `${this.remotePath}/current`;

      await this.sshExecutor(`mkdir -p ${releaseDir}`);

      // Step 2: Upload build output via SCP
      await this.scpUploader(buildOutput.outputDir, releaseDir);

      // Step 3: Generate and upload Nginx config
      const nginxConfig = this.generateNginxConfig(config, currentLink);
      await this.uploadNginxConfig(config.projectName, nginxConfig);

      // Step 4: Zero-downtime symlink swap
      await this.sshExecutor(`ln -sfn ${releaseDir} ${currentLink}`);

      // Step 5: Set edge headers in Nginx config if provided
      if (config.edgeConfig) {
        // Already handled in generateNginxConfig
      }

      // Step 6: Reload Nginx
      await this.sshExecutor('sudo nginx -t && sudo systemctl reload nginx');

      // Step 7: Clean up old releases (keep last 5)
      await this.cleanupOldReleases();

      const url = config.customDomain ? `https://${config.customDomain}` : `http://${this.host}`;

      const duration = Date.now() - startTime;

      const result: DeployResult = {
        success: true,
        url,
        deploymentId,
        duration,
        regions: config.regions,
        timestamp: new Date(),
      };

      this.deploymentHistory.push({
        id: deploymentId,
        url,
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
   * Rollback by swapping the symlink to a previous release.
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
      // List releases sorted by timestamp
      const releasesOutput = await this.sshExecutor(
        `ls -1 ${this.remotePath}/releases/ | sort -rn`
      );
      const releases = releasesOutput.trim().split('\n').filter(Boolean);

      if (releases.length < 2) {
        throw new Error('No previous release to rollback to');
      }

      // Switch symlink to the second-newest release (previous)
      const previousRelease = releases[1];
      const currentLink = `${this.remotePath}/current`;

      await this.sshExecutor(
        `ln -sfn ${this.remotePath}/releases/${previousRelease} ${currentLink}`
      );

      // Reload Nginx
      await this.sshExecutor('sudo nginx -t && sudo systemctl reload nginx');

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
   * List all deployments tracked by this deployer.
   */
  async getDeployments(): Promise<DeploymentInfo[]> {
    return this.deploymentHistory;
  }

  /**
   * Get a preview URL for a given branch.
   * For self-hosted, this uses a subdomain or path-based routing.
   */
  async getPreviewUrl(branch: string): Promise<string> {
    const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    return `http://${safeBranch}.preview.${this.host}`;
  }

  /**
   * Generate an Nginx configuration file for a HoloScript application.
   */
  generateNginxConfig(config: DeployConfig, rootPath: string): string {
    const serverName = config.customDomain || this.siteConfig.serverName;
    const listenPort = this.siteConfig.listenPort;

    const lines: string[] = [];

    lines.push('# Generated by HoloScript Edge Deployment Pipeline');
    lines.push(`# Project: ${config.projectName}`);
    lines.push(`# Environment: ${config.environment}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('server {');
    lines.push(`    listen ${listenPort};`);

    if (this.siteConfig.ssl) {
      lines.push(`    listen 443 ssl;`);
      if (this.siteConfig.sslCertPath) {
        lines.push(`    ssl_certificate ${this.siteConfig.sslCertPath};`);
      }
      if (this.siteConfig.sslKeyPath) {
        lines.push(`    ssl_certificate_key ${this.siteConfig.sslKeyPath};`);
      }
    }

    lines.push(`    server_name ${serverName};`);
    lines.push(`    root ${rootPath};`);
    lines.push(`    index index.html index.htm;`);
    lines.push('');

    // Gzip compression
    if (this.siteConfig.gzip) {
      lines.push('    gzip on;');
      lines.push(
        '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/wasm;'
      );
      lines.push('    gzip_min_length 1000;');
      lines.push('');
    }

    // Edge config headers
    if (config.edgeConfig) {
      lines.push('    # Edge configuration headers');
      if (config.edgeConfig.cacheControl) {
        lines.push(`    add_header Cache-Control "${config.edgeConfig.cacheControl}";`);
      }
      for (const [key, value] of Object.entries(config.edgeConfig.headers)) {
        lines.push(`    add_header ${key} "${value}";`);
      }
      lines.push('');
    }

    // Security headers
    lines.push('    # Security headers');
    lines.push('    add_header X-Frame-Options "SAMEORIGIN" always;');
    lines.push('    add_header X-Content-Type-Options "nosniff" always;');
    lines.push('    add_header X-XSS-Protection "1; mode=block" always;');
    lines.push('');

    // Static file caching
    lines.push('    # Static file caching');
    lines.push('    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|wasm)$ {');
    lines.push(`        expires ${this.siteConfig.cacheExpiry};`);
    lines.push('        add_header Cache-Control "public, immutable";');
    lines.push('    }');
    lines.push('');

    // WASM MIME type
    lines.push('    # WASM support');
    lines.push('    location ~* \\.wasm$ {');
    lines.push('        types { application/wasm wasm; }');
    lines.push('        add_header Cross-Origin-Embedder-Policy "require-corp";');
    lines.push('        add_header Cross-Origin-Opener-Policy "same-origin";');
    lines.push('    }');
    lines.push('');

    // SPA fallback
    lines.push('    # SPA fallback');
    lines.push('    location / {');
    lines.push('        try_files $uri $uri/ /index.html;');
    lines.push('    }');

    // Proxy pass if configured
    if (this.siteConfig.proxyPass) {
      lines.push('');
      lines.push('    # API proxy');
      lines.push('    location /api/ {');
      lines.push(`        proxy_pass ${this.siteConfig.proxyPass};`);
      lines.push('        proxy_set_header Host $host;');
      lines.push('        proxy_set_header X-Real-IP $remote_addr;');
      lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
      lines.push('        proxy_set_header X-Forwarded-Proto $scheme;');
      lines.push('    }');
    }

    // Additional custom locations
    if (this.siteConfig.additionalLocations) {
      for (const loc of this.siteConfig.additionalLocations) {
        lines.push('');
        lines.push(`    location ${loc.path} {`);
        for (const directive of loc.directives) {
          lines.push(`        ${directive}`);
        }
        lines.push('    }');
      }
    }

    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Execute a command on the remote server via SSH.
   */
  private async executeSSH(command: string): Promise<string> {
    const sshOpts: string[] = [];
    sshOpts.push(`-p ${this.port}`);

    if (this.keyPath) {
      sshOpts.push(`-i ${this.keyPath}`);
    }

    sshOpts.push('-o StrictHostKeyChecking=no');
    sshOpts.push('-o BatchMode=yes');

    const fullCommand = `ssh ${sshOpts.join(' ')} ${this.username}@${this.host} "${command}"`;

    try {
      const { stdout } = await execAsync(fullCommand, { timeout: 60_000 });
      return stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SSH command failed: ${message}`);
    }
  }

  /**
   * Upload a directory to the remote server via SCP.
   */
  private async executeScpUpload(localDir: string, remoteDir: string): Promise<void> {
    const scpOpts: string[] = [];
    scpOpts.push(`-P ${this.port}`);

    if (this.keyPath) {
      scpOpts.push(`-i ${this.keyPath}`);
    }

    scpOpts.push('-o StrictHostKeyChecking=no');
    scpOpts.push('-r');

    const command = `scp ${scpOpts.join(' ')} "${localDir}"/* ${this.username}@${this.host}:${remoteDir}/`;

    try {
      await execAsync(command, { timeout: 300_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SCP upload failed: ${message}`);
    }
  }

  /**
   * Upload the generated Nginx config to the sites-enabled directory.
   */
  private async uploadNginxConfig(projectName: string, configContent: string): Promise<void> {
    const remotePath = `${this.nginxSitesPath}/${projectName}.conf`;

    // Write config to a temp file on remote, then move into place
    const escapedContent = configContent.replace(/"/g, '\\"');
    await this.sshExecutor(`echo "${escapedContent}" | sudo tee ${remotePath} > /dev/null`);
  }

  /**
   * Remove old releases, keeping only the 5 most recent.
   */
  private async cleanupOldReleases(): Promise<void> {
    try {
      await this.sshExecutor(
        `cd ${this.remotePath}/releases && ls -1t | tail -n +6 | xargs -r rm -rf`
      );
    } catch {
      // Non-critical: cleanup failure doesn't fail the deployment
    }
  }
}
