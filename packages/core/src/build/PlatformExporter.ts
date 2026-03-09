/**
 * PlatformExporter — Target-specific export configurations
 *
 * Generates platform-specific builds (web, desktop, VR) with
 * appropriate entry points, polyfills, and configuration.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type PlatformTarget =
  | 'web'
  | 'desktop-win'
  | 'desktop-mac'
  | 'desktop-linux'
  | 'vr-quest'
  | 'vr-pcvr';

export interface PlatformConfig {
  target: PlatformTarget;
  entryPoint: string;
  outputDir: string;
  polyfills: string[];
  features: string[];
  minVersion?: string;
  optimizations: {
    minify: boolean;
    sourceMaps: boolean;
    compress: boolean;
  };
}

export interface ExportResult {
  target: PlatformTarget;
  outputDir: string;
  files: ExportFile[];
  totalSize: number;
  buildTime: number;
  warnings: string[];
}

export interface ExportFile {
  path: string;
  type: 'html' | 'js' | 'css' | 'asset' | 'manifest' | 'config';
  sizeBytes: number;
}

// =============================================================================
// PLATFORM-SPECIFIC DEFAULTS
// =============================================================================

const PLATFORM_DEFAULTS: Record<PlatformTarget, Partial<PlatformConfig>> = {
  web: {
    entryPoint: 'index.html',
    polyfills: ['webxr-polyfill', 'webgpu-polyfill'],
    features: ['service-worker', 'pwa'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
  'desktop-win': {
    entryPoint: 'main.exe',
    polyfills: [],
    features: ['native-window', 'filesystem'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
  'desktop-mac': {
    entryPoint: 'main.app',
    polyfills: [],
    features: ['native-window', 'filesystem'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
  'desktop-linux': {
    entryPoint: 'main',
    polyfills: [],
    features: ['native-window', 'filesystem'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
  'vr-quest': {
    entryPoint: 'index.html',
    polyfills: ['webxr-polyfill'],
    features: ['hand-tracking', 'passthrough', 'spatial-anchor'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
  'vr-pcvr': {
    entryPoint: 'index.html',
    polyfills: [],
    features: ['openxr', 'hand-tracking', 'eye-tracking'],
    optimizations: { minify: true, sourceMaps: false, compress: true },
  },
};

// =============================================================================
// PLATFORM EXPORTER
// =============================================================================

export class PlatformExporter {
  private configs: Map<PlatformTarget, PlatformConfig> = new Map();

  /**
   * Configure a platform target
   */
  configure(target: PlatformTarget, overrides: Partial<PlatformConfig> = {}): PlatformConfig {
    const defaults = PLATFORM_DEFAULTS[target];
    const config: PlatformConfig = {
      target,
      entryPoint: overrides.entryPoint ?? defaults.entryPoint ?? 'index.html',
      outputDir: overrides.outputDir ?? `dist/${target}`,
      polyfills: overrides.polyfills ?? defaults.polyfills ?? [],
      features: overrides.features ?? defaults.features ?? [],
      minVersion: overrides.minVersion,
      optimizations: overrides.optimizations ??
        defaults.optimizations ?? {
          minify: true,
          sourceMaps: false,
          compress: true,
        },
    };

    this.configs.set(target, config);
    return config;
  }

  /**
   * Get config for a target
   */
  getConfig(target: PlatformTarget): PlatformConfig | undefined {
    return this.configs.get(target);
  }

  /**
   * Generate export for a target (simulated)
   */
  export(target: PlatformTarget): ExportResult {
    const config = this.configs.get(target);
    if (!config) {
      // Auto-configure with defaults
      this.configure(target);
      return this.export(target);
    }

    const startTime = Date.now();
    const warnings: string[] = [];
    const files: ExportFile[] = [];

    // Generate entry point
    files.push({
      path: `${config.outputDir}/${config.entryPoint}`,
      type: config.entryPoint.endsWith('.html') ? 'html' : 'js',
      sizeBytes: 2048,
    });

    // Generate JS bundle
    files.push({
      path: `${config.outputDir}/bundle.js`,
      type: 'js',
      sizeBytes: config.optimizations.minify ? 150000 : 500000,
    });

    // Generate polyfill bundle
    if (config.polyfills.length > 0) {
      files.push({
        path: `${config.outputDir}/polyfills.js`,
        type: 'js',
        sizeBytes: config.polyfills.length * 10000,
      });
    }

    // Generate manifest
    files.push({
      path: `${config.outputDir}/manifest.json`,
      type: 'manifest',
      sizeBytes: 512,
    });

    // Platform-specific files
    if (target === 'web' && config.features.includes('pwa')) {
      files.push({ path: `${config.outputDir}/sw.js`, type: 'js', sizeBytes: 5000 });
    }

    if (config.optimizations.sourceMaps) {
      files.push({ path: `${config.outputDir}/bundle.js.map`, type: 'js', sizeBytes: 300000 });
    }

    // Warnings
    if (!config.optimizations.minify) {
      warnings.push('Minification disabled — bundle size will be larger');
    }

    const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

    return {
      target,
      outputDir: config.outputDir,
      files,
      totalSize,
      buildTime: Date.now() - startTime,
      warnings,
    };
  }

  /**
   * Export all configured targets
   */
  exportAll(): ExportResult[] {
    return [...this.configs.keys()].map((target) => this.export(target));
  }

  /**
   * Get supported platform targets
   */
  getSupportedTargets(): PlatformTarget[] {
    return Object.keys(PLATFORM_DEFAULTS) as PlatformTarget[];
  }

  /**
   * Get configured target count
   */
  getConfiguredCount(): number {
    return this.configs.size;
  }
}
