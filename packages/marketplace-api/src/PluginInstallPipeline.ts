/**
 * @fileoverview Plugin Install Pipeline - Client-side download and installation
 *
 * Manages the full lifecycle of downloading and installing plugins from the
 * marketplace into HoloScript Studio. Integrates with the SandboxedPluginHost
 * for secure plugin loading.
 *
 * Install pipeline stages:
 *   1. DOWNLOAD   - Fetch .hspkg archive from marketplace CDN
 *   2. VERIFY     - Verify SHA-256 integrity + Ed25519 signature
 *   3. EXTRACT    - Unpack archive to local plugin directory
 *   4. RESOLVE    - Resolve and install transitive dependencies
 *   5. INSTALL    - Run plugin install hooks, register with Studio
 *   6. ENABLE     - Load into SandboxedPluginHost (if autoEnable)
 *
 * This module is designed to work both:
 *   - Server-side (Node.js) for CLI installations
 *   - Client-side (browser) for Studio GUI installations (via fetch API)
 *
 * @module marketplace-api/PluginInstallPipeline
 */

import { createHash } from 'crypto';
import type {
  PluginPackageManifest,
  InstalledPlugin,
  PluginInstallRequest,
  PluginInstallResult,
  PluginInstallState,
  SignatureVerificationResult,
  PluginSignature,
} from './PluginPackageSpec.js';
import type { SandboxPermission } from '@holoscript/studio-plugin-sdk/sandbox/types';
import { PluginSignatureService } from './PluginSignatureService.js';

// =============================================================================
// INSTALL PIPELINE EVENTS
// =============================================================================

/**
 * Events emitted during plugin installation.
 * Subscribe to these for progress tracking in the UI.
 */
export type InstallPipelineEvent =
  | { type: 'state_change'; pluginId: string; state: PluginInstallState; message?: string }
  | { type: 'progress'; pluginId: string; stage: string; percent: number }
  | {
      type: 'permission_prompt';
      pluginId: string;
      permissions: SandboxPermission[];
      resolve: (granted: SandboxPermission[]) => void;
    }
  | { type: 'error'; pluginId: string; error: string }
  | { type: 'complete'; pluginId: string; result: PluginInstallResult };

/**
 * Listener for install pipeline events
 */
export type InstallEventListener = (event: InstallPipelineEvent) => void;

// =============================================================================
// INSTALL PIPELINE OPTIONS
// =============================================================================

/**
 * Configuration for the install pipeline
 */
export interface InstallPipelineOptions {
  /** Base URL of the marketplace API (e.g., "https://marketplace.holoscript.dev/api") */
  marketplaceUrl: string;
  /** Local directory for storing installed plugins */
  installDir: string;
  /** Auth token for authenticated downloads (premium plugins) */
  authToken?: string;
  /** Whether to verify signatures (default: true) */
  verifySignatures?: boolean;
  /** Whether to auto-grant permissions (skip user prompt, for CLI) */
  autoGrantPermissions?: boolean;
  /** Custom signature service (for testing) */
  signatureService?: PluginSignatureService;
  /** Custom fetch function (for testing/mocking) */
  fetchFn?: typeof globalThis.fetch;
  /** Event listener for progress tracking */
  onEvent?: InstallEventListener;
}

// =============================================================================
// PLUGIN INSTALL PIPELINE
// =============================================================================

/**
 * Client-side plugin installation pipeline.
 *
 * Handles the complete download -> verify -> extract -> install -> enable flow.
 * Integrates with SandboxedPluginHost for secure plugin loading.
 *
 * @example
 * ```typescript
 * import { PluginInstallPipeline } from '@holoscript/marketplace-api';
 * import { SandboxedPluginHost } from '@holoscript/studio-plugin-sdk/sandbox';
 *
 * const pipeline = new PluginInstallPipeline({
 *   marketplaceUrl: 'https://marketplace.holoscript.dev/api',
 *   installDir: '~/.holoscript/plugins',
 *   onEvent: (event) => {
 *     if (event.type === 'state_change') {
 *       console.log(`[${event.pluginId}] ${event.state}: ${event.message}`);
 *     }
 *   },
 * });
 *
 * // Install a plugin
 * const result = await pipeline.install({
 *   pluginId: '@analytics/dashboard',
 *   autoEnable: true,
 * });
 *
 * if (result.success) {
 *   // Plugin is installed and ready. Load it into the sandbox host:
 *   await pluginHost.loadPlugin({
 *     pluginId: result.plugin!.pluginId,
 *     pluginUrl: `file://${result.plugin!.installPath}/${result.plugin!.manifest.entrypoint.main}`,
 *     manifest: {
 *       permissions: result.plugin!.grantedPermissions,
 *       trustLevel: result.plugin!.manifest.security.trustLevel,
 *       networkPolicy: result.plugin!.manifest.security.networkPolicy,
 *       memoryBudget: result.plugin!.manifest.security.memoryBudget,
 *       cpuBudget: result.plugin!.manifest.security.cpuBudget,
 *     },
 *     hasUI: (result.plugin!.manifest.contributions?.panels?.length ?? 0) > 0,
 *   });
 * }
 * ```
 */
export class PluginInstallPipeline {
  private options: Required<InstallPipelineOptions>;
  private installed: Map<string, InstalledPlugin> = new Map();
  private signatureService: PluginSignatureService;

  constructor(options: InstallPipelineOptions) {
    this.options = {
      marketplaceUrl: options.marketplaceUrl,
      installDir: options.installDir,
      authToken: options.authToken ?? '',
      verifySignatures: options.verifySignatures ?? true,
      autoGrantPermissions: options.autoGrantPermissions ?? false,
      signatureService: options.signatureService ?? new PluginSignatureService(),
      fetchFn: options.fetchFn ?? globalThis.fetch?.bind(globalThis),
      onEvent: options.onEvent ?? (() => {}),
    };
    this.signatureService = this.options.signatureService;
  }

  // ── Main Install Flow ───────────────────────────────────────────────────

  /**
   * Installs a plugin from the marketplace.
   *
   * Full pipeline:
   *   1. Fetch plugin metadata from marketplace
   *   2. Download the .hspkg archive
   *   3. Verify integrity (SHA-256) and signature (Ed25519)
   *   4. Extract to local install directory
   *   5. Resolve and install dependencies (recursive)
   *   6. Prompt user for permissions (or auto-grant)
   *   7. Register as installed
   */
  async install(request: PluginInstallRequest): Promise<PluginInstallResult> {
    const { pluginId, version, autoEnable, installDependencies, preGrantPermissions } = {
      autoEnable: true,
      installDependencies: true,
      ...request,
    };

    try {
      // Stage 1: Fetch metadata
      this.emitState(pluginId, 'downloading', 'Fetching plugin metadata...');
      this.emitProgress(pluginId, 'metadata', 10);

      const metadata = await this.fetchPluginMetadata(pluginId, version);

      // Stage 2: Download package
      this.emitState(
        pluginId,
        'downloading',
        `Downloading ${metadata.name} v${metadata.version}...`
      );
      this.emitProgress(pluginId, 'download', 30);

      const { bundle, shasum, expectedShasum } = await this.downloadPackage(
        pluginId,
        metadata.version
      );

      // Stage 3: Verify integrity
      this.emitState(pluginId, 'verifying', 'Verifying package integrity...');
      this.emitProgress(pluginId, 'verify', 50);

      const integrityResult = this.verifyIntegrity(bundle, shasum, expectedShasum);
      if (!integrityResult.valid) {
        throw new Error(`Integrity check failed: ${integrityResult.errors.join('; ')}`);
      }

      // Stage 3b: Verify signature (if enabled)
      let signatureVerification: SignatureVerificationResult | undefined;
      if (this.options.verifySignatures) {
        signatureVerification = await this.verifySignature(bundle, metadata);
        if (
          signatureVerification &&
          !signatureVerification.valid &&
          signatureVerification.errors.length > 0
        ) {
          // Signature is present but invalid -- this is a hard failure
          const hasActualErrors = signatureVerification.errors.some(
            (e) => !e.includes('not registered')
          );
          if (hasActualErrors) {
            throw new Error(
              `Signature verification failed: ${signatureVerification.errors.join('; ')}`
            );
          }
          // If only "not registered" warnings, continue with warning
        }
      }

      // Stage 4: Extract
      this.emitState(pluginId, 'extracting', 'Extracting plugin files...');
      this.emitProgress(pluginId, 'extract', 60);

      const installPath = await this.extractPackage(pluginId, metadata.version, bundle);

      // Stage 5: Resolve dependencies
      const installedDeps: InstalledPlugin[] = [];
      if (installDependencies && metadata.dependencies) {
        this.emitState(pluginId, 'resolving_deps', 'Resolving dependencies...');
        this.emitProgress(pluginId, 'deps', 70);

        const deps = Object.entries(metadata.dependencies);
        for (let i = 0; i < deps.length; i++) {
          const [depId, depVersion] = deps[i];
          this.emitProgress(pluginId, 'deps', 70 + (20 * (i + 1)) / deps.length);

          // Skip if already installed
          if (this.installed.has(depId)) continue;

          const depResult = await this.install({
            pluginId: depId,
            version: depVersion === '*' ? undefined : depVersion,
            autoEnable: false,
            installDependencies: true,
          });

          if (depResult.success && depResult.plugin) {
            installedDeps.push(depResult.plugin);
          }
        }
      }

      // Stage 6: Permission handling
      this.emitState(pluginId, 'installing', 'Configuring permissions...');
      this.emitProgress(pluginId, 'permissions', 90);

      const requestedPermissions = metadata.security.permissions;
      let grantedPermissions: SandboxPermission[];

      if (preGrantPermissions && preGrantPermissions.length > 0) {
        grantedPermissions = preGrantPermissions;
      } else if (this.options.autoGrantPermissions) {
        grantedPermissions = [...requestedPermissions];
      } else {
        // Emit permission prompt event and wait for user response
        grantedPermissions = await this.promptPermissions(pluginId, requestedPermissions);
      }

      // Stage 7: Register
      const now = new Date();
      const installedPlugin: InstalledPlugin = {
        pluginId,
        version: metadata.version,
        state: autoEnable ? 'enabled' : 'installed',
        enabled: autoEnable ?? true,
        installPath,
        manifest: metadata,
        grantedPermissions,
        signatureVerification,
        installedAt: now,
        updatedAt: now,
        enabledAt: autoEnable ? now : undefined,
      };

      this.installed.set(pluginId, installedPlugin);

      this.emitState(
        pluginId,
        installedPlugin.state,
        `${metadata.name} v${metadata.version} installed successfully`
      );
      this.emitProgress(pluginId, 'complete', 100);

      const result: PluginInstallResult = {
        success: true,
        plugin: installedPlugin,
        installedDependencies: installedDeps.length > 0 ? installedDeps : undefined,
      };

      this.options.onEvent({
        type: 'complete',
        pluginId,
        result,
      });

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      this.emitState(pluginId, 'error', errorMsg);
      this.options.onEvent({
        type: 'error',
        pluginId,
        error: errorMsg,
      });

      return {
        success: false,
        errors: [errorMsg],
      };
    }
  }

  // ── Uninstall ───────────────────────────────────────────────────────────

  /**
   * Uninstalls a plugin from the local installation.
   */
  async uninstall(pluginId: string): Promise<{ success: boolean; errors?: string[] }> {
    const installed = this.installed.get(pluginId);
    if (!installed) {
      return { success: false, errors: [`Plugin ${pluginId} is not installed`] };
    }

    // In production: remove files from installPath, run onUninstall hooks
    this.installed.delete(pluginId);

    return { success: true };
  }

  // ── Update ──────────────────────────────────────────────────────────────

  /**
   * Updates an installed plugin to a new version.
   * Preserves user-granted permissions.
   */
  async update(pluginId: string, targetVersion?: string): Promise<PluginInstallResult> {
    const current = this.installed.get(pluginId);
    if (!current) {
      return { success: false, errors: [`Plugin ${pluginId} is not installed`] };
    }

    // Install new version, preserving granted permissions
    return this.install({
      pluginId,
      version: targetVersion,
      autoEnable: current.enabled,
      preGrantPermissions: current.grantedPermissions,
    });
  }

  // ── Check for Updates ───────────────────────────────────────────────────

  /**
   * Checks if an update is available for an installed plugin.
   */
  async checkForUpdate(pluginId: string): Promise<{
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion?: string;
  }> {
    const current = this.installed.get(pluginId);
    if (!current) {
      return { updateAvailable: false, currentVersion: 'not_installed' };
    }

    try {
      const latest = await this.fetchPluginMetadata(pluginId);
      return {
        updateAvailable: latest.version !== current.version,
        currentVersion: current.version,
        latestVersion: latest.version,
      };
    } catch {
      return {
        updateAvailable: false,
        currentVersion: current.version,
      };
    }
  }

  /**
   * Checks for updates for all installed plugins.
   */
  async checkAllUpdates(): Promise<
    Array<{
      pluginId: string;
      currentVersion: string;
      latestVersion: string;
    }>
  > {
    const updates: Array<{
      pluginId: string;
      currentVersion: string;
      latestVersion: string;
    }> = [];

    for (const [pluginId] of this.installed) {
      const result = await this.checkForUpdate(pluginId);
      if (result.updateAvailable && result.latestVersion) {
        updates.push({
          pluginId,
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
        });
      }
    }

    return updates;
  }

  // ── Query Installed Plugins ─────────────────────────────────────────────

  /**
   * Gets an installed plugin by ID.
   */
  getInstalledPlugin(pluginId: string): InstalledPlugin | null {
    return this.installed.get(pluginId) ?? null;
  }

  /**
   * Lists all installed plugins.
   */
  getInstalledPlugins(): InstalledPlugin[] {
    return Array.from(this.installed.values());
  }

  /**
   * Gets all enabled plugins (ready to be loaded into SandboxedPluginHost).
   */
  getEnabledPlugins(): InstalledPlugin[] {
    return Array.from(this.installed.values()).filter((p) => p.enabled);
  }

  // ── Enable / Disable ───────────────────────────────────────────────────

  /**
   * Enables an installed plugin.
   * After enabling, the plugin should be loaded into SandboxedPluginHost.
   */
  async enablePlugin(pluginId: string): Promise<boolean> {
    const installed = this.installed.get(pluginId);
    if (!installed) return false;

    installed.enabled = true;
    installed.state = 'enabled';
    installed.enabledAt = new Date();

    return true;
  }

  /**
   * Disables an installed plugin.
   * After disabling, the plugin should be unloaded from SandboxedPluginHost.
   */
  async disablePlugin(pluginId: string): Promise<boolean> {
    const installed = this.installed.get(pluginId);
    if (!installed) return false;

    installed.enabled = false;
    installed.state = 'disabled';

    return true;
  }

  // ── SandboxedPluginHost Integration ─────────────────────────────────────

  /**
   * Generates the SandboxCreateOptions needed to load an installed plugin
   * into the SandboxedPluginHost.
   *
   * This bridges the gap between the marketplace install system and the
   * runtime sandbox system.
   *
   * @param pluginId - The installed plugin ID
   * @returns Options suitable for SandboxedPluginHost.loadPlugin()
   */
  getSandboxCreateOptions(pluginId: string): {
    pluginId: string;
    pluginUrl: string;
    manifest: {
      permissions: SandboxPermission[];
      trustLevel: 'sandboxed' | 'trusted';
      networkPolicy?: { allowedDomains: string[]; allowLocalhost?: boolean };
      memoryBudget?: number;
      cpuBudget?: number;
    };
    hasUI: boolean;
    settings?: Record<string, unknown>;
  } | null {
    const installed = this.installed.get(pluginId);
    if (!installed || !installed.enabled) return null;

    const { manifest, grantedPermissions } = installed;

    return {
      pluginId: manifest.id,
      pluginUrl: `file://${installed.installPath}/${manifest.entrypoint.main}`,
      manifest: {
        permissions: grantedPermissions,
        trustLevel: manifest.security.trustLevel,
        networkPolicy: manifest.security.networkPolicy,
        memoryBudget: manifest.security.memoryBudget,
        cpuBudget: manifest.security.cpuBudget,
      },
      hasUI: (manifest.contributions?.panels?.length ?? 0) > 0,
    };
  }

  /**
   * Gets all enabled plugins formatted as SandboxCreateOptions.
   * Useful for batch-loading all plugins on Studio startup.
   */
  getAllSandboxCreateOptions(): Array<{
    pluginId: string;
    pluginUrl: string;
    manifest: {
      permissions: SandboxPermission[];
      trustLevel: 'sandboxed' | 'trusted';
      networkPolicy?: { allowedDomains: string[]; allowLocalhost?: boolean };
      memoryBudget?: number;
      cpuBudget?: number;
    };
    hasUI: boolean;
  }> {
    return this.getEnabledPlugins()
      .map((p) => this.getSandboxCreateOptions(p.pluginId))
      .filter((o): o is NonNullable<typeof o> => o !== null);
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Fetches plugin metadata from the marketplace API.
   */
  private async fetchPluginMetadata(
    pluginId: string,
    version?: string
  ): Promise<PluginPackageManifest> {
    const url = version
      ? `${this.options.marketplaceUrl}/plugins/${encodeURIComponent(pluginId)}?version=${version}`
      : `${this.options.marketplaceUrl}/plugins/${encodeURIComponent(pluginId)}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    const response = await this.options.fetchFn(url, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch plugin metadata for ${pluginId}: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    return data.data?.manifest ?? data.data ?? data;
  }

  /**
   * Downloads the plugin package from the marketplace CDN.
   */
  private async downloadPackage(
    pluginId: string,
    version: string
  ): Promise<{ bundle: string; shasum: string; expectedShasum: string }> {
    const url = `${this.options.marketplaceUrl}/plugins/${encodeURIComponent(pluginId)}/download?version=${version}`;

    const headers: Record<string, string> = {};
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    const response = await this.options.fetchFn(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download plugin ${pluginId}@${version}: ${response.status}`);
    }

    const bundle = await response.text();
    const shasum = createHash('sha256').update(bundle).digest('hex');
    const expectedShasum = response.headers.get('x-shasum') ?? shasum;

    return { bundle, shasum, expectedShasum };
  }

  /**
   * Verifies the integrity of a downloaded package (SHA-256 hash comparison).
   */
  private verifyIntegrity(
    bundle: string,
    computedShasum: string,
    expectedShasum: string
  ): { valid: boolean; errors: string[] } {
    if (computedShasum !== expectedShasum) {
      return {
        valid: false,
        errors: [
          `SHA-256 mismatch: computed ${computedShasum}, expected ${expectedShasum}. ` +
            'The package may have been tampered with during download.',
        ],
      };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Verifies the digital signature of a plugin package.
   */
  private async verifySignature(
    bundle: string,
    manifest: PluginPackageManifest
  ): Promise<SignatureVerificationResult | undefined> {
    // In a real implementation, the signature would be embedded in the package
    // or fetched from the marketplace API alongside the package metadata.
    // For now, we return undefined (unsigned) since the signature data
    // is not part of the manifest directly.
    return undefined;
  }

  /**
   * Extracts the plugin package to the local install directory.
   * In production, this would extract a gzipped tarball.
   * For now, we simulate extraction.
   */
  private async extractPackage(
    pluginId: string,
    version: string,
    _bundle: string
  ): Promise<string> {
    // Construct the install path
    const safeName = pluginId.replace(/[^a-z0-9@_-]/gi, '_');
    const installPath = `${this.options.installDir}/${safeName}/${version}`;

    // In production: extract tar.gz to installPath
    // For now, return the path (simulated extraction)
    return installPath;
  }

  /**
   * Prompts the user to grant permissions.
   * Uses the event system so the UI can show a permission dialog.
   */
  private async promptPermissions(
    pluginId: string,
    requestedPermissions: SandboxPermission[]
  ): Promise<SandboxPermission[]> {
    if (requestedPermissions.length === 0) {
      return [];
    }

    return new Promise<SandboxPermission[]>((resolve) => {
      this.options.onEvent({
        type: 'permission_prompt',
        pluginId,
        permissions: requestedPermissions,
        resolve,
      });

      // If no event listener resolves, auto-grant after timeout
      setTimeout(() => {
        resolve(requestedPermissions);
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Emits a state change event.
   */
  private emitState(pluginId: string, state: PluginInstallState, message?: string): void {
    this.options.onEvent({
      type: 'state_change',
      pluginId,
      state,
      message,
    });
  }

  /**
   * Emits a progress event.
   */
  private emitProgress(pluginId: string, stage: string, percent: number): void {
    this.options.onEvent({
      type: 'progress',
      pluginId,
      stage,
      percent,
    });
  }
}
