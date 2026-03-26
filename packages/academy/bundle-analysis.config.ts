/**
 * HoloScript Studio Bundle Analysis Configuration
 *
 * Provides automated bundle budget enforcement and visualization setup for
 * the Next.js-based HoloScript Studio application.
 *
 * Integrates with:
 * - @next/bundle-analyzer (Next.js official analyzer)
 * - webpack-bundle-analyzer (detailed treemap visualization)
 * - Custom budget enforcement for CI/CD gates
 *
 * Usage:
 *   ANALYZE=true pnpm --filter @holoscript/studio run build
 *
 * @version 1.0.0
 */

// =============================================================================
// BUNDLE BUDGET DEFINITIONS
// =============================================================================

/**
 * Bundle budget entry
 */
export interface BundleBudget {
  /** Budget name for reporting */
  name: string;

  /** Glob pattern to match output files */
  pattern: string;

  /** Maximum uncompressed size in bytes */
  maxSizeBytes: number;

  /** Maximum gzipped size in bytes */
  maxGzipBytes: number;

  /** Warning threshold (percentage of max) */
  warningThreshold: number;

  /** Whether exceeding budget is a hard failure */
  enforced: boolean;

  /** Budget category */
  category: 'initial' | 'lazy' | 'shared' | 'vendor' | 'total';
}

/**
 * Bundle analysis result
 */
export interface BundleAnalysisResult {
  /** Timestamp of analysis */
  timestamp: string;

  /** Git commit hash (if available) */
  commitHash?: string;

  /** Overall pass/fail */
  passed: boolean;

  /** Individual budget results */
  budgets: BudgetCheckResult[];

  /** Summary statistics */
  summary: BundleSummary;
}

/**
 * Individual budget check result
 */
export interface BudgetCheckResult {
  /** Budget name */
  name: string;

  /** Actual uncompressed size */
  actualSizeBytes: number;

  /** Actual gzipped size */
  actualGzipBytes: number;

  /** Budget maximum */
  maxSizeBytes: number;

  /** Budget gzip maximum */
  maxGzipBytes: number;

  /** Status */
  status: 'pass' | 'warning' | 'fail';

  /** Percentage of budget used */
  usagePercent: number;

  /** Human-readable message */
  message: string;
}

/**
 * Summary statistics
 */
export interface BundleSummary {
  /** Total uncompressed size (all chunks) */
  totalSizeBytes: number;

  /** Total gzipped size */
  totalGzipBytes: number;

  /** Initial load size (first paint) */
  initialLoadBytes: number;

  /** Initial load gzipped */
  initialLoadGzipBytes: number;

  /** Number of chunks */
  chunkCount: number;

  /** Number of lazy-loaded routes */
  lazyRouteCount: number;

  /** Largest chunk name and size */
  largestChunk: { name: string; sizeBytes: number };

  /** Compilation time in ms */
  compilationTimeMs: number;
}

// =============================================================================
// BASELINE BUDGETS (March 2026)
// =============================================================================

/**
 * HoloScript Studio Bundle Budgets
 *
 * These baselines are calibrated for:
 * - Next.js 15 with App Router
 * - React 19 + Three.js + R3F + XR
 * - Monaco Editor (lazy-loaded)
 * - @holoscript/core (tree-shaken)
 *
 * Baseline established: March 2026
 * Review cadence: Monthly
 */
export const STUDIO_BUNDLE_BUDGETS: BundleBudget[] = [
  // -------------------------------------------------------------------------
  // Initial Load Budgets (first paint critical path)
  // -------------------------------------------------------------------------
  {
    name: 'Initial JS (main)',
    pattern: '.next/static/chunks/main-*.js',
    maxSizeBytes: 350 * 1024, // 350 KB
    maxGzipBytes: 110 * 1024, // 110 KB gzipped
    warningThreshold: 0.85,
    enforced: true,
    category: 'initial',
  },
  {
    name: 'Initial JS (framework)',
    pattern: '.next/static/chunks/framework-*.js',
    maxSizeBytes: 200 * 1024, // 200 KB (React + Next.js)
    maxGzipBytes: 70 * 1024, // 70 KB gzipped
    warningThreshold: 0.85,
    enforced: true,
    category: 'initial',
  },
  {
    name: 'Initial CSS',
    pattern: '.next/static/css/**/*.css',
    maxSizeBytes: 80 * 1024, // 80 KB
    maxGzipBytes: 20 * 1024, // 20 KB gzipped
    warningThreshold: 0.8,
    enforced: true,
    category: 'initial',
  },

  // -------------------------------------------------------------------------
  // Vendor Budgets (third-party libraries)
  // -------------------------------------------------------------------------
  {
    name: 'Three.js + R3F bundle',
    pattern: '.next/static/chunks/*three*.js',
    maxSizeBytes: 800 * 1024, // 800 KB (three.js is large)
    maxGzipBytes: 250 * 1024, // 250 KB gzipped
    warningThreshold: 0.9,
    enforced: true,
    category: 'vendor',
  },
  {
    name: 'Monaco Editor',
    pattern: '.next/static/chunks/*monaco*.js',
    maxSizeBytes: 2 * 1024 * 1024, // 2 MB (Monaco is very large, must be lazy-loaded)
    maxGzipBytes: 600 * 1024, // 600 KB gzipped
    warningThreshold: 0.85,
    enforced: true,
    category: 'lazy',
  },
  {
    name: 'Chart.js',
    pattern: '.next/static/chunks/*chart*.js',
    maxSizeBytes: 200 * 1024, // 200 KB
    maxGzipBytes: 65 * 1024, // 65 KB gzipped
    warningThreshold: 0.85,
    enforced: false,
    category: 'lazy',
  },

  // -------------------------------------------------------------------------
  // HoloScript Core (tree-shaken)
  // -------------------------------------------------------------------------
  {
    name: '@holoscript/core',
    pattern: '.next/static/chunks/*holoscript*.js',
    maxSizeBytes: 500 * 1024, // 500 KB (includes compiler, traits, export)
    maxGzipBytes: 150 * 1024, // 150 KB gzipped
    warningThreshold: 0.85,
    enforced: true,
    category: 'shared',
  },

  // -------------------------------------------------------------------------
  // Shared Chunks
  // -------------------------------------------------------------------------
  {
    name: 'Shared chunks (commons)',
    pattern: '.next/static/chunks/commons-*.js',
    maxSizeBytes: 300 * 1024, // 300 KB
    maxGzipBytes: 100 * 1024, // 100 KB gzipped
    warningThreshold: 0.85,
    enforced: true,
    category: 'shared',
  },

  // -------------------------------------------------------------------------
  // Total Budget
  // -------------------------------------------------------------------------
  {
    name: 'Total JS (all chunks)',
    pattern: '.next/static/chunks/**/*.js',
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB total JS
    maxGzipBytes: 1.5 * 1024 * 1024, // 1.5 MB gzipped total
    warningThreshold: 0.8,
    enforced: true,
    category: 'total',
  },
  {
    name: 'Total (JS + CSS)',
    pattern: '.next/static/**/*.(js|css)',
    maxSizeBytes: 5.5 * 1024 * 1024, // 5.5 MB total
    maxGzipBytes: 1.7 * 1024 * 1024, // 1.7 MB gzipped total
    warningThreshold: 0.8,
    enforced: true,
    category: 'total',
  },
];

// =============================================================================
// BUDGET CHECKER
// =============================================================================

/**
 * Bundle Budget Checker
 *
 * Validates build output against configured budgets.
 * Designed to run in CI/CD pipelines with configurable enforcement.
 */
export class BundleBudgetChecker {
  private budgets: BundleBudget[];

  constructor(budgets: BundleBudget[] = STUDIO_BUNDLE_BUDGETS) {
    this.budgets = budgets;
  }

  /**
   * Check a single file against matching budgets
   */
  checkFile(fileName: string, sizeBytes: number, gzipBytes: number): BudgetCheckResult[] {
    const results: BudgetCheckResult[] = [];

    for (const budget of this.budgets) {
      if (this.matchesPattern(fileName, budget.pattern)) {
        const usagePercent = sizeBytes / budget.maxSizeBytes;
        const gzipUsage = gzipBytes / budget.maxGzipBytes;
        const maxUsage = Math.max(usagePercent, gzipUsage);

        let status: 'pass' | 'warning' | 'fail';
        if (maxUsage > 1.0) {
          status = 'fail';
        } else if (maxUsage > budget.warningThreshold) {
          status = 'warning';
        } else {
          status = 'pass';
        }

        const message =
          status === 'fail'
            ? `OVER BUDGET: ${fileName} is ${this.formatBytes(sizeBytes)} (limit: ${this.formatBytes(budget.maxSizeBytes)}) [${(usagePercent * 100).toFixed(1)}%]`
            : status === 'warning'
              ? `WARNING: ${fileName} approaching budget at ${(usagePercent * 100).toFixed(1)}%`
              : `OK: ${fileName} is ${this.formatBytes(sizeBytes)} [${(usagePercent * 100).toFixed(1)}% of budget]`;

        results.push({
          name: budget.name,
          actualSizeBytes: sizeBytes,
          actualGzipBytes: gzipBytes,
          maxSizeBytes: budget.maxSizeBytes,
          maxGzipBytes: budget.maxGzipBytes,
          status,
          usagePercent: usagePercent * 100,
          message,
        });
      }
    }

    return results;
  }

  /**
   * Generate analysis result from collected budget checks
   */
  generateReport(
    checks: BudgetCheckResult[],
    summary: BundleSummary,
    commitHash?: string
  ): BundleAnalysisResult {
    const hasFail = checks.some(
      (c) => c.status === 'fail' && this.budgets.find((b) => b.name === c.name)?.enforced
    );

    return {
      timestamp: new Date().toISOString(),
      commitHash,
      passed: !hasFail,
      budgets: checks,
      summary,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Simple glob pattern matcher
   */
  private matchesPattern(fileName: string, pattern: string): boolean {
    // Convert glob to regex (simplified)
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '__GLOBSTAR__')
          .replace(/\*/g, '[^/]*')
          .replace(/__GLOBSTAR__/g, '.*') +
        '$'
    );
    return regex.test(fileName);
  }
}

// =============================================================================
// NEXT.JS BUNDLE ANALYZER CONFIG
// =============================================================================

/**
 * Next.js webpack config extension for bundle analysis.
 *
 * Add to next.config.js:
 * ```js
 * const { withBundleAnalysis } = require('./bundle-analysis.config');
 * module.exports = withBundleAnalysis(nextConfig);
 * ```
 *
 * Activate with: ANALYZE=true pnpm build
 */
export function getAnalyzerWebpackConfig() {
  return {
    // Webpack Bundle Analyzer configuration
    analyzerMode: process.env.ANALYZE === 'true' ? 'static' : 'disabled',
    reportFilename: '../bundle-report.html',
    openAnalyzer: false,
    generateStatsFile: true,
    statsFilename: '../bundle-stats.json',
    statsOptions: {
      source: false,
      modules: true,
      chunks: true,
      chunkModules: true,
      assets: true,
    },
  };
}

/**
 * Performance hints for webpack (enforced in CI)
 */
export function getPerformanceHints(isCI: boolean) {
  return {
    hints: isCI ? ('error' as const) : ('warning' as const),
    maxEntrypointSize: 400 * 1024, // 400 KB for initial entrypoints
    maxAssetSize: 800 * 1024, // 800 KB for individual assets
    assetFilter: (assetFilename: string) => {
      // Only check JS and CSS assets
      return /\.(js|css)$/.test(assetFilename);
    },
  };
}

// =============================================================================
// BASELINE RECORDING
// =============================================================================

/**
 * Record current bundle sizes as baseline for future comparison.
 * Stores JSON in .next/bundle-baseline.json
 */
export interface BundleBaseline {
  /** When baseline was recorded */
  recordedAt: string;

  /** Git commit hash */
  commitHash: string;

  /** Bundle sizes by file */
  files: Record<
    string,
    {
      sizeBytes: number;
      gzipBytes: number;
    }
  >;

  /** Summary at time of baseline */
  summary: BundleSummary;
}

/**
 * Compare current build against recorded baseline
 */
export function compareToBaseline(
  current: BundleSummary,
  baseline: BundleBaseline
): {
  totalDelta: number;
  totalDeltaPercent: number;
  initialDelta: number;
  initialDeltaPercent: number;
  improved: boolean;
  message: string;
} {
  const totalDelta = current.totalSizeBytes - baseline.summary.totalSizeBytes;
  const totalDeltaPercent =
    baseline.summary.totalSizeBytes > 0 ? (totalDelta / baseline.summary.totalSizeBytes) * 100 : 0;

  const initialDelta = current.initialLoadBytes - baseline.summary.initialLoadBytes;
  const initialDeltaPercent =
    baseline.summary.initialLoadBytes > 0
      ? (initialDelta / baseline.summary.initialLoadBytes) * 100
      : 0;

  const improved = totalDelta < 0;

  const direction = totalDelta > 0 ? 'increased' : 'decreased';
  const message =
    `Bundle size ${direction} by ${Math.abs(totalDeltaPercent).toFixed(1)}% ` +
    `(${totalDelta > 0 ? '+' : ''}${new BundleBudgetChecker().formatBytes(Math.abs(totalDelta))}) ` +
    `since ${baseline.commitHash.substring(0, 7)}`;

  return {
    totalDelta,
    totalDeltaPercent,
    initialDelta,
    initialDeltaPercent,
    improved,
    message,
  };
}
