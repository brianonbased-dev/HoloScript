/**
 * @fileoverview Marketplace Submission Pipeline
 * @module @holoscript/core/marketplace
 *
 * The full lifecycle for submitting HoloScript creations to the marketplace:
 * 1. Package — bundle source, assets, metadata
 * 2. Verify — run safety pass, check capabilities, validate budget
 * 3. Sign — generate safety certificate, attach DID signature
 * 4. Publish — submit to registry
 *
 * This bridges the compile-time safety system to the marketplace.
 *
 * @version 1.0.0
 */

import {
  runSafetyPass,
  SafetyPassResult,
  EffectASTNode,
} from '@holoscript/core';
import { SafetyReport, SafetyVerdict } from '@holoscript/core';
import { PlatformTarget } from '@holoscript/core';

// =============================================================================
// PACKAGE TYPES
// =============================================================================

/** Categories of marketplace content */
export type ContentCategory =
  | 'world' // Full world/scene
  | 'object' // Single object/prefab
  | 'agent' // AI agent
  | 'trait' // Custom trait
  | 'shader' // Shader/material
  | 'vfx' // Visual effect
  | 'audio' // Audio pack
  | 'template' // Project template
  | 'plugin'; // Editor plugin

/** Version following semver */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Publisher identity */
export interface Publisher {
  id: string;
  name: string;
  did: string; // DID for verification
  verified: boolean;
  trustLevel: 'new' | 'verified' | 'trusted' | 'official';
}

/** Package metadata */
export interface PackageMetadata {
  /** Unique package ID (e.g., @publisher/package-name) */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: ContentCategory;
  /** Version */
  version: SemanticVersion;
  /** Publisher */
  publisher: Publisher;
  /** Tags for search */
  tags: string[];
  /** Target platforms */
  platforms: PlatformTarget[];
  /** License */
  license: string;
  /** Dependencies */
  dependencies: { id: string; version: string }[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update */
  updatedAt: string;
}

/** A marketplace package ready for submission */
export interface MarketplacePackage {
  metadata: PackageMetadata;
  /** Bundled AST nodes for safety verification */
  nodes: EffectASTNode[];
  /** Asset manifest (file paths → sizes) */
  assets: { path: string; sizeBytes: number; hash: string }[];
  /** Total bundle size in bytes */
  bundleSizeBytes: number;
}

// =============================================================================
// SUBMISSION PIPELINE
// =============================================================================

/** Submission status */
export type SubmissionStatus =
  | 'draft'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'published'
  | 'delisted';

/** A marketplace submission */
export interface MarketplaceSubmission {
  /** Submission ID */
  id: string;
  /** Package */
  package: MarketplacePackage;
  /** Current status */
  status: SubmissionStatus;
  /** Safety report (after verification) */
  safetyReport?: SafetyReport;
  /** Safety pass result */
  safetyResult?: SafetyPassResult;
  /** Rejection reasons */
  rejectionReasons?: string[];
  /** Timestamps */
  submittedAt: string;
  verifiedAt?: string;
  publishedAt?: string;
}

/** Submission configuration */
export interface SubmissionConfig {
  /** Maximum bundle size (bytes) */
  maxBundleSize: number;
  /** Minimum publisher trust level for auto-publish */
  autoPublishTrustLevel: 'verified' | 'trusted' | 'official';
  /** Target platforms to verify against */
  verifyPlatforms: PlatformTarget[];
  /** Trust level for safety checking */
  defaultTrustLevel: string;
  /** Allow warnings to be published */
  allowWarnings: boolean;
}

const DEFAULT_CONFIG: SubmissionConfig = {
  maxBundleSize: 50 * 1024 * 1024, // 50MB
  autoPublishTrustLevel: 'trusted',
  verifyPlatforms: ['quest3', 'webxr'],
  defaultTrustLevel: 'basic',
  allowWarnings: true,
};

/**
 * Step 1: Package — create a submission from source.
 */
export function createSubmission(pkg: MarketplacePackage): MarketplaceSubmission {
  return {
    id: `sub_${Date.now()}_${pkg.metadata.id}`,
    package: pkg,
    status: 'draft',
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Step 2: Verify — run safety pass on the package.
 */
export function verifySubmission(
  submission: MarketplaceSubmission,
  config: Partial<SubmissionConfig> = {}
): MarketplaceSubmission {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  submission.status = 'verifying';

  // Pre-checks
  const preRejections: string[] = [];
  if (submission.package.bundleSizeBytes > cfg.maxBundleSize) {
    preRejections.push(
      `Bundle too large: ${(submission.package.bundleSizeBytes / 1024 / 1024).toFixed(1)}MB > ${cfg.maxBundleSize / 1024 / 1024}MB limit`
    );
  }
  if (!submission.package.metadata.name) {
    preRejections.push('Missing package name');
  }
  if (!submission.package.metadata.publisher.id) {
    preRejections.push('Missing publisher ID');
  }

  if (preRejections.length > 0) {
    submission.status = 'rejected';
    submission.rejectionReasons = preRejections;
    return submission;
  }

  // Run safety pass
  const safetyResult = runSafetyPass(submission.package.nodes, {
    moduleId: submission.package.metadata.id,
    targetPlatforms: cfg.verifyPlatforms,
    trustLevel: cfg.defaultTrustLevel,
    generateCertificate: true,
  });

  submission.safetyResult = safetyResult;
  submission.safetyReport = safetyResult.report;

  // Determine outcome
  if (safetyResult.report.verdict === 'unsafe') {
    submission.status = 'rejected';
    submission.rejectionReasons = [
      ...safetyResult.report.effects.violations
        .filter((v) => v.severity === 'error')
        .map((v) => v.message),
      ...safetyResult.report.budget.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => d.message),
      ...safetyResult.report.capabilities.missing.map((m) => `Missing capability: ${m.scope}`),
    ];
  } else if (safetyResult.report.verdict === 'warnings' && !cfg.allowWarnings) {
    submission.status = 'rejected';
    submission.rejectionReasons = ['Package has safety warnings (strict mode)'];
  } else {
    submission.status = 'verified';
    submission.verifiedAt = new Date().toISOString();
  }

  return submission;
}

/**
 * Step 3: Publish — move from verified to published.
 */
export function publishSubmission(
  submission: MarketplaceSubmission,
  config: Partial<SubmissionConfig> = {}
): MarketplaceSubmission {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (submission.status !== 'verified') {
    throw new Error(`Cannot publish: status is '${submission.status}', expected 'verified'`);
  }

  // Auto-publish check
  const publisher = submission.package.metadata.publisher;
  const trustLevels = ['new', 'verified', 'trusted', 'official'];
  const required = trustLevels.indexOf(cfg.autoPublishTrustLevel);
  const actual = trustLevels.indexOf(publisher.trustLevel);

  if (actual >= required || publisher.trustLevel === 'official') {
    submission.status = 'published';
    submission.publishedAt = new Date().toISOString();
  }
  // If trust level is too low, stays in 'verified' for manual review

  return submission;
}

/**
 * Get a human-readable submission summary.
 */
export function submissionSummary(submission: MarketplaceSubmission): string {
  const lines: string[] = [];
  lines.push(
    `📦 ${submission.package.metadata.name} v${formatVersion(submission.package.metadata.version)}`
  );
  lines.push(
    `   Publisher: ${submission.package.metadata.publisher.name} (${submission.package.metadata.publisher.trustLevel})`
  );
  lines.push(`   Category: ${submission.package.metadata.category}`);
  lines.push(`   Status: ${statusIcon(submission.status)} ${submission.status.toUpperCase()}`);

  if (submission.safetyReport) {
    lines.push(
      `   Safety: ${submission.safetyReport.verdict} (danger: ${submission.safetyReport.dangerScore}/10)`
    );
    lines.push(
      `   Effects: ${submission.safetyReport.effects.totalEffects} across [${submission.safetyReport.effects.categories.join(', ')}]`
    );
  }

  if (submission.rejectionReasons?.length) {
    lines.push('   Rejections:');
    for (const r of submission.rejectionReasons) lines.push(`     ✗ ${r}`);
  }

  return lines.join('\n');
}

function formatVersion(v: SemanticVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}
function statusIcon(s: SubmissionStatus): string {
  return (
    {
      draft: '📝',
      verifying: '🔍',
      verified: '✅',
      rejected: '❌',
      published: '🚀',
      delisted: '🚫',
    }[s] || '❓'
  );
}
