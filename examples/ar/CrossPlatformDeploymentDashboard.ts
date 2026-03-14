/**
 * CrossPlatformDeploymentDashboard.ts
 *
 * Dashboard for managing deployments across VR/AR platforms.
 * Provides build status tracking, platform-specific configurations
 * (Quest, PCVR, WebXR, iOS AR), deploy history, and rollback capability.
 *
 * This module manages the logical state of cross-platform deployments.
 * UI rendering is delegated to the consuming framework (React, Vue, etc.)
 * through event callbacks and state queries.
 *
 * @module CrossPlatformDeploymentDashboard
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Supported deployment target platforms.
 */
export type Platform =
  | 'quest-2'
  | 'quest-3'
  | 'quest-pro'
  | 'pcvr-steamvr'
  | 'pcvr-openxr'
  | 'webxr'
  | 'ios-arkit'
  | 'android-arcore'
  | 'visionos'
  | 'pico-4'
  | 'custom';

/**
 * Build status for a specific platform.
 */
export type BuildStatus =
  | 'idle'
  | 'queued'
  | 'building'
  | 'testing'
  | 'packaging'
  | 'uploading'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/**
 * Deployment environment tier.
 */
export type DeployEnvironment = 'development' | 'staging' | 'production';

/**
 * Platform-specific build configuration.
 */
export interface PlatformConfig {
  platform: Platform;
  enabled: boolean;
  displayName: string;

  // Build settings
  buildCommand: string;
  outputDir: string;
  targetArch: string;
  optimizationLevel: 'none' | 'size' | 'speed' | 'balanced';
  minification: boolean;
  sourceMaps: boolean;

  // Platform-specific settings
  settings: Record<string, unknown>;

  // Quality settings
  qualityPreset: 'low' | 'medium' | 'high' | 'ultra';
  maxTextureSize: number;
  shaderQuality: 'low' | 'medium' | 'high';
  antiAliasing: 'none' | 'msaa-2x' | 'msaa-4x' | 'fxaa' | 'taa';

  // Performance budgets
  maxBundleSizeKB: number;
  targetFPS: number;
  maxDrawCalls: number;
  maxTriangles: number;

  // Signing / credentials
  signingConfig?: {
    keystore?: string;
    keystorePassword?: string;
    keyAlias?: string;
    provisioningProfile?: string;
    teamId?: string;
  };
}

/**
 * A single build record.
 */
export interface BuildRecord {
  id: string;
  platform: Platform;
  environment: DeployEnvironment;
  status: BuildStatus;
  version: string;
  buildNumber: number;
  commitHash: string;
  branch: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;  // in ms
  artifacts: BuildArtifact[];
  logs: BuildLogEntry[];
  testResults: TestResult | null;
  metadata: Record<string, unknown>;
  error: string | null;
}

/**
 * Build artifact (output file).
 */
export interface BuildArtifact {
  name: string;
  path: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
  platform: Platform;
  createdAt: number;
}

/**
 * Build log entry.
 */
export interface BuildLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

/**
 * Test execution result.
 */
export interface TestResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: number;  // 0..100
  failures: TestFailure[];
}

/**
 * Individual test failure.
 */
export interface TestFailure {
  testName: string;
  suite: string;
  message: string;
  stack: string;
  platform: Platform;
}

/**
 * A deployment to a specific environment.
 */
export interface Deployment {
  id: string;
  buildId: string;
  platform: Platform;
  environment: DeployEnvironment;
  version: string;
  buildNumber: number;
  deployedAt: number;
  deployedBy: string;
  status: 'active' | 'rolled-back' | 'superseded';
  url?: string;
  releaseNotes: string;
  metadata: Record<string, unknown>;
}

/**
 * Dashboard configuration.
 */
export interface DashboardConfig {
  /** Project name */
  projectName?: string;
  /** Project version */
  projectVersion?: string;
  /** Maximum build history to retain per platform */
  maxBuildHistory?: number;
  /** Maximum deployment history to retain */
  maxDeployHistory?: number;
  /** Auto-increment build numbers */
  autoIncrementBuildNumber?: boolean;
  /** Parallel build limit */
  maxParallelBuilds?: number;
  /** Enable CI/CD webhook integration */
  enableWebhooks?: boolean;
  /** Webhook URL */
  webhookUrl?: string;
  /** Default environment */
  defaultEnvironment?: DeployEnvironment;
}

/**
 * Health check for a deployed instance.
 */
export interface HealthCheck {
  platform: Platform;
  environment: DeployEnvironment;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unreachable';
  latency: number;     // ms
  uptime: number;      // seconds
  lastChecked: number;
  version: string;
  details: Record<string, unknown>;
}

/**
 * Dashboard summary statistics.
 */
export interface DashboardSummary {
  projectName: string;
  projectVersion: string;
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  totalDeployments: number;
  activeDeployments: number;
  platformStatuses: Map<Platform, BuildStatus>;
  lastBuildTime: number | null;
  lastDeployTime: number | null;
  healthStatuses: Map<string, HealthCheck>;
  buildSuccessRate: number;  // 0..1
}

// =============================================================================
// Event Types
// =============================================================================

export type DashboardEventType =
  | 'build-queued'
  | 'build-started'
  | 'build-progress'
  | 'build-succeeded'
  | 'build-failed'
  | 'build-cancelled'
  | 'deploy-started'
  | 'deploy-completed'
  | 'deploy-failed'
  | 'rollback-started'
  | 'rollback-completed'
  | 'health-check-completed'
  | 'config-changed'
  | 'error';

export interface DashboardEvent {
  type: DashboardEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: DashboardEvent) => void;

// =============================================================================
// Build Provider Interface
// =============================================================================

/**
 * Platform-provided build system adapter.
 * The consuming platform implements this to execute actual builds.
 */
export interface BuildProvider {
  /** Execute a build for a specific platform */
  executeBuild(config: PlatformConfig, environment: DeployEnvironment): Promise<BuildRecord>;
  /** Cancel an in-progress build */
  cancelBuild(buildId: string): Promise<void>;
  /** Upload build artifacts to a distribution service */
  uploadArtifacts(buildId: string, artifacts: BuildArtifact[]): Promise<string>;
  /** Run tests for a specific platform */
  runTests(config: PlatformConfig): Promise<TestResult>;
  /** Perform a health check on a deployed instance */
  healthCheck(platform: Platform, environment: DeployEnvironment): Promise<HealthCheck>;
}

// =============================================================================
// Utility Functions
// =============================================================================

function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// =============================================================================
// Default Platform Configurations
// =============================================================================

function createDefaultPlatformConfigs(): Map<Platform, PlatformConfig> {
  const configs = new Map<Platform, PlatformConfig>();

  configs.set('quest-3', {
    platform: 'quest-3',
    enabled: true,
    displayName: 'Meta Quest 3',
    buildCommand: 'holoscript build --target quest3',
    outputDir: 'dist/quest3',
    targetArch: 'arm64-v8a',
    optimizationLevel: 'balanced',
    minification: true,
    sourceMaps: false,
    settings: {
      androidSdkVersion: 32,
      xrFeatures: ['hand-tracking', 'passthrough', 'spatial-anchors'],
      refreshRate: 120,
      foveationLevel: 'dynamic',
      appLabCategory: 'education',
    },
    qualityPreset: 'high',
    maxTextureSize: 2048,
    shaderQuality: 'high',
    antiAliasing: 'msaa-4x',
    maxBundleSizeKB: 512000,  // 500MB
    targetFPS: 72,
    maxDrawCalls: 100,
    maxTriangles: 750000,
  });

  configs.set('quest-2', {
    platform: 'quest-2',
    enabled: true,
    displayName: 'Meta Quest 2',
    buildCommand: 'holoscript build --target quest2',
    outputDir: 'dist/quest2',
    targetArch: 'arm64-v8a',
    optimizationLevel: 'size',
    minification: true,
    sourceMaps: false,
    settings: {
      androidSdkVersion: 29,
      xrFeatures: ['hand-tracking'],
      refreshRate: 90,
      foveationLevel: 'high',
    },
    qualityPreset: 'medium',
    maxTextureSize: 1024,
    shaderQuality: 'medium',
    antiAliasing: 'msaa-2x',
    maxBundleSizeKB: 256000,  // 250MB
    targetFPS: 72,
    maxDrawCalls: 50,
    maxTriangles: 300000,
  });

  configs.set('pcvr-steamvr', {
    platform: 'pcvr-steamvr',
    enabled: true,
    displayName: 'PCVR (SteamVR)',
    buildCommand: 'holoscript build --target steamvr',
    outputDir: 'dist/steamvr',
    targetArch: 'x86_64',
    optimizationLevel: 'speed',
    minification: true,
    sourceMaps: true,
    settings: {
      steamAppId: '',
      renderingBackend: 'vulkan',
      supersampling: 1.5,
      reprojection: 'motion-smoothing',
    },
    qualityPreset: 'ultra',
    maxTextureSize: 4096,
    shaderQuality: 'high',
    antiAliasing: 'taa',
    maxBundleSizeKB: 2048000,  // 2GB
    targetFPS: 90,
    maxDrawCalls: 500,
    maxTriangles: 5000000,
  });

  configs.set('webxr', {
    platform: 'webxr',
    enabled: true,
    displayName: 'WebXR',
    buildCommand: 'holoscript build --target webxr',
    outputDir: 'dist/webxr',
    targetArch: 'wasm',
    optimizationLevel: 'size',
    minification: true,
    sourceMaps: true,
    settings: {
      serviceWorker: true,
      compression: 'brotli',
      chunkSplitting: true,
      lazyLoadModels: true,
      cdn: '',
    },
    qualityPreset: 'medium',
    maxTextureSize: 2048,
    shaderQuality: 'medium',
    antiAliasing: 'fxaa',
    maxBundleSizeKB: 10240,  // 10MB initial bundle
    targetFPS: 72,
    maxDrawCalls: 100,
    maxTriangles: 500000,
  });

  configs.set('ios-arkit', {
    platform: 'ios-arkit',
    enabled: false,
    displayName: 'iOS (ARKit)',
    buildCommand: 'holoscript build --target arkit',
    outputDir: 'dist/arkit',
    targetArch: 'arm64',
    optimizationLevel: 'balanced',
    minification: true,
    sourceMaps: false,
    settings: {
      iosDeploymentTarget: '16.0',
      arFeatures: ['world-tracking', 'face-tracking', 'body-tracking', 'lidar-mesh'],
      metalFeatures: ['gpu-family-apple7'],
      bitcode: false,
    },
    qualityPreset: 'high',
    maxTextureSize: 2048,
    shaderQuality: 'high',
    antiAliasing: 'msaa-4x',
    maxBundleSizeKB: 200000,  // 200MB (App Store limit consideration)
    targetFPS: 60,
    maxDrawCalls: 100,
    maxTriangles: 500000,
  });

  configs.set('android-arcore', {
    platform: 'android-arcore',
    enabled: false,
    displayName: 'Android (ARCore)',
    buildCommand: 'holoscript build --target arcore',
    outputDir: 'dist/arcore',
    targetArch: 'arm64-v8a',
    optimizationLevel: 'balanced',
    minification: true,
    sourceMaps: false,
    settings: {
      androidSdkVersion: 28,
      arFeatures: ['plane-detection', 'image-tracking', 'depth-api'],
      googlePlayFiltering: true,
    },
    qualityPreset: 'medium',
    maxTextureSize: 1024,
    shaderQuality: 'medium',
    antiAliasing: 'msaa-2x',
    maxBundleSizeKB: 150000,
    targetFPS: 60,
    maxDrawCalls: 80,
    maxTriangles: 300000,
  });

  configs.set('visionos', {
    platform: 'visionos',
    enabled: false,
    displayName: 'Apple Vision Pro (visionOS)',
    buildCommand: 'holoscript build --target visionos',
    outputDir: 'dist/visionos',
    targetArch: 'arm64',
    optimizationLevel: 'balanced',
    minification: true,
    sourceMaps: false,
    settings: {
      visionosDeploymentTarget: '1.0',
      immersionStyle: 'mixed',
      spatialComputing: true,
      realityKitFeatures: ['spatial-audio', 'hand-tracking', 'eye-tracking'],
    },
    qualityPreset: 'ultra',
    maxTextureSize: 4096,
    shaderQuality: 'high',
    antiAliasing: 'msaa-4x',
    maxBundleSizeKB: 500000,
    targetFPS: 90,
    maxDrawCalls: 200,
    maxTriangles: 1000000,
  });

  return configs;
}

// =============================================================================
// CrossPlatformDeploymentDashboard
// =============================================================================

/**
 * CrossPlatformDeploymentDashboard manages builds, deployments, and rollbacks
 * across multiple VR/AR platforms from a single control plane.
 */
export class CrossPlatformDeploymentDashboard {
  // Configuration
  private projectName: string;
  private projectVersion: string;
  private maxBuildHistory: number;
  private maxDeployHistory: number;
  private autoIncrementBuildNumber: boolean;
  private maxParallelBuilds: number;
  private defaultEnvironment: DeployEnvironment;

  // Platform configurations
  private platformConfigs: Map<Platform, PlatformConfig>;

  // Build records
  private builds: Map<string, BuildRecord> = new Map();
  private buildsByPlatform: Map<Platform, string[]> = new Map();
  private nextBuildNumber: number = 1;
  private activeBuilds: Set<string> = new Set();

  // Deployments
  private deployments: Map<string, Deployment> = new Map();
  private deploymentsByPlatformEnv: Map<string, string[]> = new Map();

  // Health checks
  private healthStatuses: Map<string, HealthCheck> = new Map();

  // Build provider
  private buildProvider: BuildProvider | null = null;

  // Webhooks
  private enableWebhooks: boolean;
  private webhookUrl: string;

  // Events
  private eventHandlers: Map<DashboardEventType, Set<EventHandler>> = new Map();

  constructor(config: DashboardConfig = {}) {
    this.projectName = config.projectName ?? 'HoloScript Project';
    this.projectVersion = config.projectVersion ?? '1.0.0';
    this.maxBuildHistory = config.maxBuildHistory ?? 50;
    this.maxDeployHistory = config.maxDeployHistory ?? 100;
    this.autoIncrementBuildNumber = config.autoIncrementBuildNumber ?? true;
    this.maxParallelBuilds = config.maxParallelBuilds ?? 3;
    this.defaultEnvironment = config.defaultEnvironment ?? 'development';
    this.enableWebhooks = config.enableWebhooks ?? false;
    this.webhookUrl = config.webhookUrl ?? '';

    this.platformConfigs = createDefaultPlatformConfigs();
  }

  // ===========================================================================
  // Build Provider
  // ===========================================================================

  /**
   * Set the build provider adapter.
   */
  setBuildProvider(provider: BuildProvider): void {
    this.buildProvider = provider;
  }

  // ===========================================================================
  // Platform Configuration
  // ===========================================================================

  /**
   * Get configuration for a specific platform.
   */
  getPlatformConfig(platform: Platform): PlatformConfig | undefined {
    const config = this.platformConfigs.get(platform);
    return config ? { ...config } : undefined;
  }

  /**
   * Update configuration for a specific platform.
   */
  setPlatformConfig(platform: Platform, config: Partial<PlatformConfig>): void {
    const existing = this.platformConfigs.get(platform);
    if (existing) {
      Object.assign(existing, config);
    } else {
      this.platformConfigs.set(platform, config as PlatformConfig);
    }
    this.emitEvent('config-changed', { platform, config });
  }

  /**
   * Enable or disable a platform.
   */
  setPlatformEnabled(platform: Platform, enabled: boolean): void {
    const config = this.platformConfigs.get(platform);
    if (config) {
      config.enabled = enabled;
      this.emitEvent('config-changed', { platform, enabled });
    }
  }

  /**
   * Get all platform configurations.
   */
  getAllPlatformConfigs(): Map<Platform, PlatformConfig> {
    return new Map(
      Array.from(this.platformConfigs.entries()).map(([k, v]) => [k, { ...v }]),
    );
  }

  /**
   * Get all enabled platforms.
   */
  getEnabledPlatforms(): Platform[] {
    return Array.from(this.platformConfigs.entries())
      .filter(([, config]) => config.enabled)
      .map(([platform]) => platform);
  }

  // ===========================================================================
  // Build Operations
  // ===========================================================================

  /**
   * Queue a build for a specific platform.
   */
  async queueBuild(
    platform: Platform,
    environment: DeployEnvironment = this.defaultEnvironment,
    commitHash: string = 'HEAD',
    branch: string = 'main',
  ): Promise<string> {
    const config = this.platformConfigs.get(platform);
    if (!config) {
      throw new Error(`[Dashboard] Platform "${platform}" not configured.`);
    }
    if (!config.enabled) {
      throw new Error(`[Dashboard] Platform "${platform}" is disabled.`);
    }
    if (this.activeBuilds.size >= this.maxParallelBuilds) {
      throw new Error(
        `[Dashboard] Maximum parallel builds (${this.maxParallelBuilds}) reached. Wait for current builds to complete.`,
      );
    }

    const buildNumber = this.autoIncrementBuildNumber ? this.nextBuildNumber++ : 0;
    const buildId = generateId('build');

    const build: BuildRecord = {
      id: buildId,
      platform,
      environment,
      status: 'queued',
      version: this.projectVersion,
      buildNumber,
      commitHash,
      branch,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      artifacts: [],
      logs: [],
      testResults: null,
      metadata: {},
      error: null,
    };

    this.builds.set(buildId, build);
    this.addBuildToPlatformHistory(platform, buildId);
    this.activeBuilds.add(buildId);

    this.emitEvent('build-queued', { buildId, platform, environment });

    // Execute build asynchronously
    this.executeBuild(buildId, config, environment);

    return buildId;
  }

  /**
   * Queue builds for all enabled platforms.
   */
  async queueAllBuilds(
    environment: DeployEnvironment = this.defaultEnvironment,
    commitHash: string = 'HEAD',
    branch: string = 'main',
  ): Promise<string[]> {
    const buildIds: string[] = [];
    const enabledPlatforms = this.getEnabledPlatforms();

    for (const platform of enabledPlatforms) {
      try {
        const buildId = await this.queueBuild(platform, environment, commitHash, branch);
        buildIds.push(buildId);
      } catch (err) {
        this.emitEvent('error', {
          message: `Failed to queue build for ${platform}`,
          error: err,
        });
      }
    }

    return buildIds;
  }

  /**
   * Execute a build using the build provider.
   */
  private async executeBuild(
    buildId: string,
    config: PlatformConfig,
    environment: DeployEnvironment,
  ): Promise<void> {
    const build = this.builds.get(buildId);
    if (!build) return;

    build.status = 'building';
    this.addLog(buildId, 'info', `Build started for ${config.displayName}`, 'dashboard');
    this.emitEvent('build-started', { buildId, platform: config.platform });

    if (!this.buildProvider) {
      build.status = 'failed';
      build.error = 'No build provider configured';
      build.endTime = Date.now();
      build.duration = build.endTime - build.startTime;
      this.activeBuilds.delete(buildId);
      this.emitEvent('build-failed', { buildId, error: build.error });
      return;
    }

    try {
      const result = await this.buildProvider.executeBuild(config, environment);

      // Merge result into our build record
      build.status = result.status;
      build.artifacts = result.artifacts;
      build.testResults = result.testResults;
      build.endTime = Date.now();
      build.duration = build.endTime - build.startTime;
      build.error = result.error;

      if (result.logs) {
        build.logs.push(...result.logs);
      }

      if (build.status === 'succeeded') {
        this.addLog(buildId, 'info', `Build succeeded in ${build.duration}ms`, 'dashboard');
        this.emitEvent('build-succeeded', {
          buildId,
          platform: config.platform,
          duration: build.duration,
          artifacts: build.artifacts.length,
        });
      } else {
        this.addLog(buildId, 'error', `Build failed: ${build.error}`, 'dashboard');
        this.emitEvent('build-failed', {
          buildId,
          platform: config.platform,
          error: build.error,
        });
      }
    } catch (err) {
      build.status = 'failed';
      build.error = err instanceof Error ? err.message : String(err);
      build.endTime = Date.now();
      build.duration = build.endTime - build.startTime;
      this.addLog(buildId, 'error', `Build exception: ${build.error}`, 'dashboard');
      this.emitEvent('build-failed', { buildId, error: build.error });
    } finally {
      this.activeBuilds.delete(buildId);
    }
  }

  /**
   * Cancel an in-progress build.
   */
  async cancelBuild(buildId: string): Promise<void> {
    const build = this.builds.get(buildId);
    if (!build) return;

    if (build.status !== 'building' && build.status !== 'queued' && build.status !== 'testing') {
      console.warn(`[Dashboard] Build ${buildId} is not in a cancellable state.`);
      return;
    }

    if (this.buildProvider) {
      await this.buildProvider.cancelBuild(buildId);
    }

    build.status = 'cancelled';
    build.endTime = Date.now();
    build.duration = build.endTime - build.startTime;
    this.activeBuilds.delete(buildId);

    this.addLog(buildId, 'info', 'Build cancelled', 'dashboard');
    this.emitEvent('build-cancelled', { buildId });
  }

  /**
   * Get a specific build record.
   */
  getBuild(buildId: string): BuildRecord | undefined {
    return this.builds.get(buildId);
  }

  /**
   * Get build history for a specific platform.
   */
  getBuildHistory(platform: Platform): BuildRecord[] {
    const ids = this.buildsByPlatform.get(platform) ?? [];
    return ids
      .map((id) => this.builds.get(id))
      .filter((b): b is BuildRecord => b !== undefined);
  }

  /**
   * Get the most recent build for a platform.
   */
  getLatestBuild(platform: Platform): BuildRecord | undefined {
    const ids = this.buildsByPlatform.get(platform) ?? [];
    if (ids.length === 0) return undefined;
    return this.builds.get(ids[ids.length - 1]);
  }

  /**
   * Add a build to the platform history, enforcing max history.
   */
  private addBuildToPlatformHistory(platform: Platform, buildId: string): void {
    if (!this.buildsByPlatform.has(platform)) {
      this.buildsByPlatform.set(platform, []);
    }
    const history = this.buildsByPlatform.get(platform)!;
    history.push(buildId);

    while (history.length > this.maxBuildHistory) {
      const oldId = history.shift()!;
      this.builds.delete(oldId);
    }
  }

  /**
   * Add a log entry to a build.
   */
  private addLog(
    buildId: string,
    level: BuildLogEntry['level'],
    message: string,
    source: string,
  ): void {
    const build = this.builds.get(buildId);
    if (build) {
      build.logs.push({
        timestamp: Date.now(),
        level,
        message,
        source,
      });
    }
  }

  // ===========================================================================
  // Deployment Operations
  // ===========================================================================

  /**
   * Deploy a successful build to an environment.
   */
  async deploy(
    buildId: string,
    environment: DeployEnvironment = this.defaultEnvironment,
    deployedBy: string = 'system',
    releaseNotes: string = '',
  ): Promise<string> {
    const build = this.builds.get(buildId);
    if (!build) {
      throw new Error(`[Dashboard] Build "${buildId}" not found.`);
    }
    if (build.status !== 'succeeded') {
      throw new Error(
        `[Dashboard] Cannot deploy build "${buildId}" with status "${build.status}". Only succeeded builds can be deployed.`,
      );
    }

    // Mark any existing active deployment for this platform+environment as superseded
    const key = `${build.platform}:${environment}`;
    const existingIds = this.deploymentsByPlatformEnv.get(key) ?? [];
    for (const existingId of existingIds) {
      const existing = this.deployments.get(existingId);
      if (existing && existing.status === 'active') {
        existing.status = 'superseded';
      }
    }

    const deployId = generateId('deploy');
    const deployment: Deployment = {
      id: deployId,
      buildId,
      platform: build.platform,
      environment,
      version: build.version,
      buildNumber: build.buildNumber,
      deployedAt: Date.now(),
      deployedBy,
      status: 'active',
      releaseNotes,
      metadata: {},
    };

    // Upload artifacts if build provider supports it
    if (this.buildProvider && build.artifacts.length > 0) {
      try {
        const url = await this.buildProvider.uploadArtifacts(buildId, build.artifacts);
        deployment.url = url;
      } catch (err) {
        this.emitEvent('deploy-failed', {
          deployId,
          buildId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    this.deployments.set(deployId, deployment);
    if (!this.deploymentsByPlatformEnv.has(key)) {
      this.deploymentsByPlatformEnv.set(key, []);
    }
    this.deploymentsByPlatformEnv.get(key)!.push(deployId);

    // Enforce max deploy history
    const deployHistory = this.deploymentsByPlatformEnv.get(key)!;
    while (deployHistory.length > this.maxDeployHistory) {
      const oldId = deployHistory.shift()!;
      this.deployments.delete(oldId);
    }

    this.emitEvent('deploy-completed', {
      deployId,
      buildId,
      platform: build.platform,
      environment,
      version: build.version,
    });

    // Send webhook notification
    if (this.enableWebhooks) {
      this.sendWebhook('deploy', deployment);
    }

    return deployId;
  }

  /**
   * Rollback to a previous deployment.
   */
  async rollback(
    platform: Platform,
    environment: DeployEnvironment,
    targetDeployId?: string,
  ): Promise<string | null> {
    const key = `${platform}:${environment}`;
    const deployIds = this.deploymentsByPlatformEnv.get(key) ?? [];

    if (deployIds.length < 2 && !targetDeployId) {
      console.warn('[Dashboard] No previous deployment to rollback to.');
      return null;
    }

    this.emitEvent('rollback-started', { platform, environment, targetDeployId });

    // Find the current active deployment
    let currentActiveId: string | null = null;
    for (let i = deployIds.length - 1; i >= 0; i--) {
      const d = this.deployments.get(deployIds[i]);
      if (d && d.status === 'active') {
        currentActiveId = deployIds[i];
        break;
      }
    }

    // Mark current as rolled back
    if (currentActiveId) {
      const current = this.deployments.get(currentActiveId);
      if (current) {
        current.status = 'rolled-back';
      }
    }

    // Find and reactivate target
    let targetId = targetDeployId;
    if (!targetId) {
      // Find the most recent superseded deployment
      for (let i = deployIds.length - 1; i >= 0; i--) {
        const d = this.deployments.get(deployIds[i]);
        if (d && d.status === 'superseded') {
          targetId = deployIds[i];
          break;
        }
      }
    }

    if (!targetId) {
      console.warn('[Dashboard] No valid rollback target found.');
      return null;
    }

    const target = this.deployments.get(targetId);
    if (target) {
      target.status = 'active';

      this.emitEvent('rollback-completed', {
        platform,
        environment,
        rolledBackFrom: currentActiveId,
        rolledBackTo: targetId,
        version: target.version,
        buildNumber: target.buildNumber,
      });

      return targetId;
    }

    return null;
  }

  /**
   * Get deployment history for a platform+environment combination.
   */
  getDeployHistory(platform: Platform, environment: DeployEnvironment): Deployment[] {
    const key = `${platform}:${environment}`;
    const ids = this.deploymentsByPlatformEnv.get(key) ?? [];
    return ids
      .map((id) => this.deployments.get(id))
      .filter((d): d is Deployment => d !== undefined);
  }

  /**
   * Get the currently active deployment for a platform+environment.
   */
  getActiveDeployment(platform: Platform, environment: DeployEnvironment): Deployment | undefined {
    const key = `${platform}:${environment}`;
    const ids = this.deploymentsByPlatformEnv.get(key) ?? [];
    for (let i = ids.length - 1; i >= 0; i--) {
      const d = this.deployments.get(ids[i]);
      if (d && d.status === 'active') return d;
    }
    return undefined;
  }

  // ===========================================================================
  // Health Checks
  // ===========================================================================

  /**
   * Run health checks for all active deployments.
   */
  async runHealthChecks(): Promise<Map<string, HealthCheck>> {
    if (!this.buildProvider) return this.healthStatuses;

    const activeDeployments: Deployment[] = [];
    for (const deployment of this.deployments.values()) {
      if (deployment.status === 'active') {
        activeDeployments.push(deployment);
      }
    }

    for (const deployment of activeDeployments) {
      try {
        const health = await this.buildProvider.healthCheck(
          deployment.platform,
          deployment.environment,
        );
        const key = `${deployment.platform}:${deployment.environment}`;
        this.healthStatuses.set(key, health);
      } catch (err) {
        const key = `${deployment.platform}:${deployment.environment}`;
        this.healthStatuses.set(key, {
          platform: deployment.platform,
          environment: deployment.environment,
          status: 'unreachable',
          latency: -1,
          uptime: 0,
          lastChecked: Date.now(),
          version: deployment.version,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    this.emitEvent('health-check-completed', {
      checked: activeDeployments.length,
      statuses: Object.fromEntries(this.healthStatuses),
    });

    return this.healthStatuses;
  }

  /**
   * Get the health status for a specific platform+environment.
   */
  getHealthStatus(platform: Platform, environment: DeployEnvironment): HealthCheck | undefined {
    return this.healthStatuses.get(`${platform}:${environment}`);
  }

  // ===========================================================================
  // Dashboard Summary
  // ===========================================================================

  /**
   * Get a comprehensive dashboard summary.
   */
  getSummary(): DashboardSummary {
    let totalBuilds = 0;
    let successfulBuilds = 0;
    let failedBuilds = 0;
    let lastBuildTime: number | null = null;

    for (const build of this.builds.values()) {
      totalBuilds++;
      if (build.status === 'succeeded') successfulBuilds++;
      if (build.status === 'failed') failedBuilds++;
      if (build.endTime && (lastBuildTime === null || build.endTime > lastBuildTime)) {
        lastBuildTime = build.endTime;
      }
    }

    let totalDeployments = 0;
    let activeDeployments = 0;
    let lastDeployTime: number | null = null;

    for (const deploy of this.deployments.values()) {
      totalDeployments++;
      if (deploy.status === 'active') activeDeployments++;
      if (lastDeployTime === null || deploy.deployedAt > lastDeployTime) {
        lastDeployTime = deploy.deployedAt;
      }
    }

    const platformStatuses = new Map<Platform, BuildStatus>();
    for (const [platform] of this.platformConfigs) {
      const latest = this.getLatestBuild(platform);
      platformStatuses.set(platform, latest?.status ?? 'idle');
    }

    return {
      projectName: this.projectName,
      projectVersion: this.projectVersion,
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      totalDeployments,
      activeDeployments,
      platformStatuses,
      lastBuildTime,
      lastDeployTime,
      healthStatuses: new Map(this.healthStatuses),
      buildSuccessRate: totalBuilds > 0 ? successfulBuilds / totalBuilds : 0,
    };
  }

  // ===========================================================================
  // Webhooks
  // ===========================================================================

  /**
   * Send a webhook notification.
   */
  private async sendWebhook(eventType: string, data: unknown): Promise<void> {
    if (!this.enableWebhooks || !this.webhookUrl) return;

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: eventType,
          project: this.projectName,
          timestamp: Date.now(),
          data,
        }),
      });
    } catch (err) {
      console.error('[Dashboard] Webhook send failed:', err);
    }
  }

  // ===========================================================================
  // Version Management
  // ===========================================================================

  /**
   * Set the project version.
   */
  setVersion(version: string): void {
    this.projectVersion = version;
    this.emitEvent('config-changed', { version });
  }

  /**
   * Get the current project version.
   */
  getVersion(): string {
    return this.projectVersion;
  }

  /**
   * Bump the version (semver-compatible).
   */
  bumpVersion(part: 'major' | 'minor' | 'patch'): string {
    const parts = this.projectVersion.split('.').map(Number);
    while (parts.length < 3) parts.push(0);

    switch (part) {
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;
      case 'patch':
        parts[2]++;
        break;
    }

    this.projectVersion = parts.join('.');
    this.emitEvent('config-changed', { version: this.projectVersion });
    return this.projectVersion;
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: DashboardEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: DashboardEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emitEvent(type: DashboardEventType, data?: unknown): void {
    const event: DashboardEvent = { type, timestamp: Date.now(), data };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[Dashboard] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.builds.clear();
    this.buildsByPlatform.clear();
    this.deployments.clear();
    this.deploymentsByPlatformEnv.clear();
    this.healthStatuses.clear();
    this.activeBuilds.clear();
    this.eventHandlers.clear();
    this.buildProvider = null;
  }
}
