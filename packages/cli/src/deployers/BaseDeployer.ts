/**
 * HoloScript Edge Deployment Pipeline - Base Deployer
 *
 * Abstract base class for all edge deployment targets.
 * Provides shared build, validation, and event lifecycle.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Interfaces
// ============================================================================

export interface DeployConfig {
  target: 'cloudflare' | 'vercel' | 'netlify' | 'custom';
  projectName: string;
  environment: 'staging' | 'production';
  regions: string[];
  customDomain?: string;
  buildSettings: {
    minify: boolean;
    splitChunks: boolean;
    prerender: boolean;
  };
  edgeConfig?: {
    cacheControl: string;
    headers: Record<string, string>;
  };
}

export interface DeployResult {
  success: boolean;
  url: string;
  deploymentId: string;
  duration: number;
  regions: string[];
  timestamp: Date;
  error?: string;
}

export interface DeploymentInfo {
  id: string;
  url: string;
  environment: string;
  status: 'building' | 'deploying' | 'ready' | 'failed';
  createdAt: Date;
  regions: string[];
}

export interface BuildOutput {
  outputDir: string;
  files: string[];
  totalSize: number;
  entrypoint: string;
  sourceMaps: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type DeployerEvent = 'build:start' | 'build:done' | 'deploy:start' | 'deploy:done';

export interface DeployerEvents {
  'build:start': (config: DeployConfig) => void;
  'build:done': (output: BuildOutput) => void;
  'deploy:start': (config: DeployConfig) => void;
  'deploy:done': (result: DeployResult) => void;
}

// ============================================================================
// Abstract Base Class
// ============================================================================

export abstract class BaseDeployer extends EventEmitter {
  protected name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  /**
   * Deploy a built project to the target platform.
   */
  abstract deploy(config: DeployConfig, buildOutput: BuildOutput): Promise<DeployResult>;

  /**
   * Rollback to a previous deployment by ID.
   */
  abstract rollback(deploymentId: string): Promise<DeployResult>;

  /**
   * List all deployments for the current project.
   */
  abstract getDeployments(): Promise<DeploymentInfo[]>;

  /**
   * Get a preview URL for a given branch.
   */
  abstract getPreviewUrl(branch: string): Promise<string>;

  /**
   * Build the HoloScript project, producing output files.
   * Runs `holoscript compile` and collects the output.
   */
  async buildProject(config: DeployConfig): Promise<BuildOutput> {
    this.emit('build:start', config);

    const outputDir = path.resolve('.holoscript-build', config.projectName);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const flags: string[] = [];
    if (config.buildSettings.minify) flags.push('--minify');
    if (config.buildSettings.splitChunks) flags.push('--split-chunks');
    if (config.buildSettings.prerender) flags.push('--prerender');

    const command = `holoscript compile --out "${outputDir}" ${flags.join(' ')}`.trim();

    try {
      await execAsync(command, { timeout: 120_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackOutput: BuildOutput = {
        outputDir,
        files: [],
        totalSize: 0,
        entrypoint: 'index.js',
        sourceMaps: false,
      };
      this.emit('build:done', fallbackOutput);
      throw new Error(`Build failed: ${message}`);
    }

    // Collect build output info
    const files = await this.collectBuildFiles(outputDir);
    let totalSize = 0;
    for (const file of files) {
      try {
        const stat = await fs.promises.stat(path.join(outputDir, file));
        totalSize += stat.size;
      } catch {
        // skip files that can't be stat'd
      }
    }

    const entrypoint = files.find((f) => f === 'index.js') || files[0] || 'index.js';

    const output: BuildOutput = {
      outputDir,
      files,
      totalSize,
      entrypoint,
      sourceMaps: files.some((f) => f.endsWith('.map')),
    };

    this.emit('build:done', output);
    return output;
  }

  /**
   * Validate a deploy configuration object.
   * Throws if any required fields are missing or invalid.
   */
  validateConfig(config: DeployConfig): void {
    if (!config.projectName || config.projectName.trim().length === 0) {
      throw new Error('Project name is required');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(config.projectName)) {
      throw new Error(
        'Project name must contain only alphanumeric characters, hyphens, and underscores'
      );
    }

    const validTargets = ['cloudflare', 'vercel', 'netlify', 'custom'];
    if (!validTargets.includes(config.target)) {
      throw new Error(
        `Invalid target: ${config.target}. Must be one of: ${validTargets.join(', ')}`
      );
    }

    const validEnvironments = ['staging', 'production'];
    if (!validEnvironments.includes(config.environment)) {
      throw new Error(
        `Invalid environment: ${config.environment}. Must be one of: ${validEnvironments.join(', ')}`
      );
    }

    if (!config.regions || config.regions.length === 0) {
      throw new Error('At least one region is required');
    }

    if (!config.buildSettings) {
      throw new Error('Build settings are required');
    }

    if (typeof config.buildSettings.minify !== 'boolean') {
      throw new Error('buildSettings.minify must be a boolean');
    }

    if (typeof config.buildSettings.splitChunks !== 'boolean') {
      throw new Error('buildSettings.splitChunks must be a boolean');
    }

    if (typeof config.buildSettings.prerender !== 'boolean') {
      throw new Error('buildSettings.prerender must be a boolean');
    }
  }

  /**
   * Utility: generate a unique deployment ID.
   */
  protected generateDeploymentId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.name}-${timestamp}-${random}`;
  }

  /**
   * Utility: recursively collect all files in a directory.
   */
  private async collectBuildFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = entry.name;
        if (entry.isDirectory()) {
          const subFiles = await this.collectBuildFiles(path.join(dir, entry.name));
          files.push(...subFiles.map((f) => path.join(relativePath, f)));
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch {
      // directory may not exist yet
    }

    return files;
  }
}
